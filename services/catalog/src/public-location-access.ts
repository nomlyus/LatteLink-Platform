/**
 * Public customer runtime access requires both canonical ownership and current launchability.
 * A bootstrap response is discovery data only; it is not authorization for later requests.
 */
export async function isPublicCustomerLocationAccessible(input: {
  brandId: string;
  locationId: string;
  doesLocationBelongToBrand(brandId: string, locationId: string): Promise<boolean>;
  isCustomerLocationLaunchableForBrand(brandId: string, locationId: string): Promise<boolean>;
}) {
  if (!(await input.doesLocationBelongToBrand(input.brandId, input.locationId))) {
    return false;
  }

  return input.isCustomerLocationLaunchableForBrand(input.brandId, input.locationId);
}
