import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { OrderItem } from "@lattelink/contracts-orders";
import type { CheckoutOrderSnapshot, CheckoutSubmissionStage } from "./checkout";

export type CheckoutConfirmation = {
  orderId: string;
  pickupCode: string;
  status: CheckoutOrderSnapshot["status"];
  total: CheckoutOrderSnapshot["total"];
  items: OrderItem[];
  occurredAt: string;
};

export type CheckoutFailure = {
  message: string;
  stage: CheckoutSubmissionStage;
  occurredAt: string;
  order?: CheckoutOrderSnapshot;
};

type CheckoutFlowContextValue = {
  confirmation: CheckoutConfirmation | null;
  failure: CheckoutFailure | null;
  retryOrder: CheckoutOrderSnapshot | null;
  setConfirmation: (confirmation: CheckoutConfirmation) => void;
  setFailure: (failure: CheckoutFailure) => void;
  clearConfirmation: () => void;
  clearFailure: () => void;
  clearRetryOrder: () => void;
};

const CheckoutFlowContext = createContext<CheckoutFlowContextValue | undefined>(undefined);

export function CheckoutFlowProvider({ children }: { children: ReactNode }) {
  const [confirmation, setConfirmationState] = useState<CheckoutConfirmation | null>(null);
  const [failure, setFailureState] = useState<CheckoutFailure | null>(null);
  const [retryOrder, setRetryOrder] = useState<CheckoutOrderSnapshot | null>(null);

  const value = useMemo<CheckoutFlowContextValue>(
    () => ({
      confirmation,
      failure,
      retryOrder,
      setConfirmation: (nextConfirmation) => {
        setConfirmationState(nextConfirmation);
        setFailureState(null);
        setRetryOrder(null);
      },
      setFailure: (nextFailure) => {
        setFailureState(nextFailure);
        setRetryOrder(nextFailure.order ?? null);
      },
      clearConfirmation: () => setConfirmationState(null),
      clearFailure: () => setFailureState(null),
      clearRetryOrder: () => setRetryOrder(null)
    }),
    [confirmation, failure, retryOrder]
  );

  return <CheckoutFlowContext.Provider value={value}>{children}</CheckoutFlowContext.Provider>;
}

export function useCheckoutFlow() {
  const context = useContext(CheckoutFlowContext);
  if (!context) {
    throw new Error("useCheckoutFlow must be used inside CheckoutFlowProvider");
  }

  return context;
}
