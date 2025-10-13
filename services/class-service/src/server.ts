import http from "http";
import index from "./index";
import "dotenv/config";
import { connectToDB } from "./model/registry";

const PORT = process.env.CLASS_PORT || 7303;

const server = http.createServer(index);

connectToDB()
  .then(() => {
    console.log("MongoDB Connected!");
    server.listen(PORT);
    console.log("Class service server listening on http://localhost:" + PORT);
  })
  .catch((err) => {
    console.error("Failed to connect to DB");
    console.error(err);
  });
