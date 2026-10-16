import { createOrder } from "../services/orders.js";

export function postOrder(req, res) {
  const order = createOrder(req.body);
  return res.json(order);
}
