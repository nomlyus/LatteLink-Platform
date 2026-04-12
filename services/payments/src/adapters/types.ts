import type { Order } from "@lattelink/contracts-orders";
import type { ChargeRequest, ChargeResponse, RefundRequest, RefundResponse } from "../routes.js";

export interface PosAdapter {
  submitOrder(order: Order): Promise<void>;
  processCharge(request: ChargeRequest): Promise<{ response: ChargeResponse; providerPaymentId?: string }>;
  processRefund(request: RefundRequest, providerPaymentId?: string): Promise<RefundResponse>;
}
