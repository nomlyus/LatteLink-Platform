import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addCartItemAtLocation,
  calculateItemCount,
  calculateSubtotalCents,
  clearCartSnapshot,
  removeCartSnapshotItem,
  setCartSnapshotItemQuantity,
  type AddCartItemAtLocationResult,
  type CartItem,
  type CartItemInput,
  type CartSnapshot
} from "./model";

type CartContextValue = {
  locationId: string | null;
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
  discountCode: string;
  setDiscountCode: (code: string) => void;
  addItem: (item: CartItemInput, selectedLocationId: string | null) => AddCartItemAtLocationResult;
  setQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartSnapshot>(clearCartSnapshot);
  const cartRef = useRef(cart);
  cartRef.current = cart;

  const commit = (nextCart: CartSnapshot) => {
    cartRef.current = nextCart;
    setCart(nextCart);
  };

  const value = useMemo<CartContextValue>(() => {
    const itemCount = calculateItemCount(cart.items);
    const subtotalCents = calculateSubtotalCents(cart.items);

    return {
      locationId: cart.locationId,
      items: cart.items,
      itemCount,
      subtotalCents,
      discountCode: cart.discountCode,
      setDiscountCode: (code) => {
        commit({ ...cartRef.current, discountCode: code.toUpperCase().replace(/[^A-Z0-9_-]/g, "") });
      },
      addItem: (item, selectedLocationId) => {
        const result = addCartItemAtLocation(cartRef.current, selectedLocationId, item);
        if (result.ok) {
          commit(result.cart);
        }
        return result;
      },
      setQuantity: (lineId, quantity) => {
        commit(setCartSnapshotItemQuantity(cartRef.current, lineId, quantity));
      },
      removeItem: (lineId) => {
        commit(removeCartSnapshotItem(cartRef.current, lineId));
      },
      clear: () => commit(clearCartSnapshot())
    };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
