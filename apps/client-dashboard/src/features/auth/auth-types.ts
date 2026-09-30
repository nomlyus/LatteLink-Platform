import { z } from "zod";
import {
  operatorAuthProvidersSchema,
  operatorCapabilitySchema,
  operatorSessionSchema,
  operatorUserSchema
} from "@lattelink/contracts-auth";

export const storedOperatorSessionSchema = operatorSessionSchema.extend({
  apiBaseUrl: z.string().min(1)
});

export type OperatorSession = z.output<typeof storedOperatorSessionSchema>;
export type OperatorUser = z.output<typeof operatorUserSchema>;
export type OperatorAuthProviders = z.output<typeof operatorAuthProvidersSchema>;
export type OperatorCapability = z.output<typeof operatorCapabilitySchema>;
