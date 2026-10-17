import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createPublicApi } from "@/lib/public-api";

export const publicApi = createPublicApi({
  account: async () => (await getServerSession(authOptions))?.user?.email,
  secret: () => process.env.PARTY_TOKEN_SECRET,
});
