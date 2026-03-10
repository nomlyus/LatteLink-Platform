import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  addCartItem,
  calculateItemCount,
  calculateSubtotalCents,
  removeCartItem,
  setCartItemQuantity,
  type CartItem,
  type CartItemInput
} from "./model";

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
  addItem: (item: CartItemInput) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = calculateItemCount(items);
    const subtotalCents = calculateSubtotalCents(items);

    return {
      items,
      itemCount,
      subtotalCents,
      addItem: (item) => {
        setItems((prev) => addCartItem(prev, item));
      },
      setQuantity: (lineId, quantity) => setItems((prev) => setCartItemQuantity(prev, lineId, quantity)),
      removeItem: (lineId) => setItems((prev) => removeCartItem(prev, lineId)),
      clear: () => setItems([])
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
