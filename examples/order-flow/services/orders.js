import { insertOrder } from "../repositories/orders.js";

export function createOrder(input) {
  const order = {
    items: input.items,
    status: "pending",
  };
  return insertOrder(order);
}
