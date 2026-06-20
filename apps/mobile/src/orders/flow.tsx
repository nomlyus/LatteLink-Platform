import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { OrderItem } from "@lattelink/contracts-orders";
import type { CheckoutDraftSnapshot, CheckoutSubmissionStage } from "./checkout";
import type { Order } from "@lattelink/contracts-orders";

export type CheckoutConfirmation = {
  orderId: string;
  pickupCode: string;
  status: Order["status"];
  total: Order["total"];
  items: OrderItem[];
  occurredAt: string;
};

export type CheckoutFailure = {
  message: string;
  stage: CheckoutSubmissionStage;
  occurredAt: string;
  checkout?: CheckoutDraftSnapshot;
};

type CheckoutFlowContextValue = {
  confirmation: CheckoutConfirmation | null;
  failure: CheckoutFailure | null;
  retryOrder: CheckoutDraftSnapshot | null;
  setConfirmation: (confirmation: CheckoutConfirmation) => void;
  setFailure: (failure: CheckoutFailure) => void;
  setRetryOrder: (checkout: CheckoutDraftSnapshot) => void;
  clearConfirmation: () => void;
  clearFailure: () => void;
  clearRetryOrder: () => void;
};

const CheckoutFlowContext = createContext<CheckoutFlowContextValue | undefined>(undefined);

export function CheckoutFlowProvider({ children }: { children: ReactNode }) {
  const [confirmation, setConfirmationState] = useState<CheckoutConfirmation | null>(null);
  const [failure, setFailureState] = useState<CheckoutFailure | null>(null);
  const [retryOrder, setRetryOrder] = useState<CheckoutDraftSnapshot | null>(null);

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
        setRetryOrder(nextFailure.checkout ?? null);
      },
      setRetryOrder,
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
