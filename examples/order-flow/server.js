import { postOrder } from "./controllers/orders.js";

export function registerOrderRoutes(app) {
  app.post("/api/orders", postOrder);
}
