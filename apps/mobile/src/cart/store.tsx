import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  id: string;
  name: string;
  priceCents: number;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);

    return {
      items,
      itemCount,
      subtotalCents,
      addItem: (item) => {
        setItems((prev) => {
          const existing = prev.find((entry) => entry.id === item.id);
          if (!existing) {
            return [...prev, { ...item, quantity: 1 }];
          }

          return prev.map((entry) =>
            entry.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry
          );
        });
      },
      setQuantity: (itemId, quantity) => {
        setItems((prev) => {
          if (quantity <= 0) {
            return prev.filter((entry) => entry.id !== itemId);
          }

          return prev.map((entry) => (entry.id === itemId ? { ...entry, quantity } : entry));
        });
      },
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
