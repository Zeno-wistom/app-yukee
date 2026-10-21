// The browser performs all inference locally; only small pose messages reach this server.
class CameraBridge {
  HttpServer server;
  ExecutorService executor;
  volatile int direction=0, jumpId=0;
  volatile boolean tracked=false, calibrated=false;
  volatile long lastSeen=0;
  String error="";
  int port=0;
  final String token=java.util.UUID.randomUUID().toString();

  boolean ready() { return tracked && calibrated && System.currentTimeMillis()-lastSeen<800; }

  void start() {
    try {
      server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
      port=server.getAddress().getPort();
      executor=Executors.newFixedThreadPool(2,r->{ Thread t=new Thread(r,"cloudhop-camera"); t.setDaemon(true); return t; });
      server.setExecutor(executor);
      server.createContext("/",exchange->{
        try {
          String requestPath=exchange.getRequestURI().getPath();
          if(requestPath.equals("/pose")) {
            if(!exchange.getRequestMethod().equals("POST") || !token.equals(exchange.getRequestHeaders().getFirst("X-CloudHop-Token"))) { respond(exchange,403,"text/plain","Forbidden".getBytes(StandardCharsets.UTF_8)); return; }
            byte[] bytes=exchange.getRequestBody().readNBytes(1025);
            if(bytes.length>1024) { respond(exchange,413,"text/plain",new byte[0]); return; }
            JSONObject data=JSONObject.parse(new String(bytes,StandardCharsets.UTF_8));
            int nextDirection=data.getInt("direction",0);
            direction=nextDirection>=-1 && nextDirection<=1 ? nextDirection : 0;
            jumpId=data.getInt("jumpId",0);
            tracked=data.getBoolean("tracked",false); calibrated=data.getBoolean("calibrated",false);
            lastSeen=System.currentTimeMillis();
            respond(exchange,200,"text/plain","ok".getBytes(StandardCharsets.UTF_8)); return;
          }
          if(!exchange.getRequestMethod().equals("GET")) { respond(exchange,405,"text/plain",new byte[0]); return; }
          if(requestPath.equals("/session")) { respond(exchange,200,"application/json",("{\"token\":\""+token+"\"}").getBytes(StandardCharsets.UTF_8)); return; }
          Path root=java.nio.file.Paths.get(dataPath("tracker")).toAbsolutePath().normalize();
          Path file=root.resolve(requestPath.equals("/")?"index.html":requestPath.substring(1)).normalize();
          if(!file.startsWith(root) || !Files.isRegularFile(file)) { respond(exchange,404,"text/plain","Not found".getBytes(StandardCharsets.UTF_8)); return; }
          String name=file.toString();
          String mime=name.endsWith(".html")?"text/html; charset=utf-8":name.endsWith(".js")||name.endsWith(".mjs")?"text/javascript":name.endsWith(".wasm")?"application/wasm":"application/octet-stream";
          respond(exchange,200,mime,Files.readAllBytes(file));
        } catch(Exception e) { try { respond(exchange,400,"text/plain","Bad request".getBytes(StandardCharsets.UTF_8)); } catch(Exception ignored) {} }
        finally { exchange.close(); }
      });
      server.start();
      println("Camera setup: http://127.0.0.1:"+port+"/");
    } catch(Exception e) { error="摄像头连接服务未启动，请重启游戏或先用键盘体验。"; println(e); }
  }

  void respond(HttpExchange exchange,int status,String mime,byte[] body) throws java.io.IOException {
    exchange.getResponseHeaders().set("Content-Type",mime);
    exchange.getResponseHeaders().set("Cache-Control","no-store");
    exchange.getResponseHeaders().set("X-Content-Type-Options","nosniff");
    exchange.sendResponseHeaders(status,body.length); exchange.getResponseBody().write(body);
  }
  void stop() { if(server!=null) server.stop(0); if(executor!=null) executor.shutdownNow(); }
}
