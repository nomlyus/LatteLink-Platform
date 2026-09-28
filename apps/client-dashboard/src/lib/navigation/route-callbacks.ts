export function readStripeReturnParams(search: string) {
  const params = new URLSearchParams(search);
  return {
    returned: params.has("stripeReturn"),
    refreshRequested: params.has("stripeRefresh")
  };
}

export function stripStripeReturnParams(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  params.delete("stripeReturn");
  params.delete("stripeRefresh");
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}`;
}
