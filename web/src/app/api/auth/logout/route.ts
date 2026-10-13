import { endSession } from "@/lib/auth/current-user";
import { ok, route } from "@/lib/http";

export const POST = route(async () => {
  await endSession();
  return ok({ loggedOut: true });
});
