import NextAuth from "next-auth";
import type { OAuthConfig } from "next-auth/providers";
import { prisma } from "@/lib/prisma";

interface AnnictProfile {
  annictId: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

interface AnnictUserinfoResponse {
  data?: { viewer?: AnnictProfile | null };
  errors?: Array<{ message?: string }>;
}

function isAnnictProfile(profile: unknown): profile is AnnictProfile {
  if (!profile || typeof profile !== "object") return false;
  const candidate = profile as Record<string, unknown>;
  return (
    typeof candidate.annictId === "number" &&
    typeof candidate.username === "string" &&
    (typeof candidate.name === "string" || candidate.name === null) &&
    (typeof candidate.avatarUrl === "string" || candidate.avatarUrl === null)
  );
}

const VIEWER_QUERY = `
  query {
    viewer {
      annictId
      username
      name
      avatarUrl
    }
  }
`;

const AnnictProvider: OAuthConfig<AnnictProfile> = {
  id: "annict",
  name: "Annict",
  type: "oauth",
  clientId: process.env.ANNICT_CLIENT_ID,
  clientSecret: process.env.ANNICT_CLIENT_SECRET,
  authorization: {
    url: "https://annict.com/oauth/authorize",
    params: { scope: "read write" },
  },
  token: "https://api.annict.com/oauth/token",
  userinfo: {
    url: "https://api.annict.com/graphql",
    async request({ tokens }: { tokens: { access_token?: string } }) {
      if (!tokens.access_token) {
        throw new Error("Annict authentication failed: access token is missing");
      }

      const response = await fetch("https://api.annict.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({ query: VIEWER_QUERY }),
      });

      if (!response.ok) {
        throw new Error(`Annict userinfo request failed (status ${response.status})`);
      }

      let json: AnnictUserinfoResponse;
      try {
        json = (await response.json()) as AnnictUserinfoResponse;
      } catch {
        throw new Error("Annict userinfo request returned an invalid response");
      }

      if (json.errors?.length) {
        const message = json.errors.map((error) => error.message).filter(Boolean).join(", ");
        throw new Error(`Annict userinfo request failed${message ? `: ${message}` : ""}`);
      }
      if (!json.data?.viewer) {
        throw new Error("Annict userinfo response did not include the viewer profile");
      }

      return json.data.viewer;
    },
  },
  profile(profile) {
    return {
      id: String(profile.annictId),
      name: profile.name ?? profile.username,
      image: profile.avatarUrl,
    };
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [AnnictProvider],
  callbacks: {
    async jwt({ token, profile, account }) {
      if (account && profile) {
        if (!isAnnictProfile(profile)) {
          throw new Error("Annict authentication failed: profile is invalid");
        }
        if (!account.access_token) {
          throw new Error("Annict authentication failed: access token is missing");
        }

        const user = await prisma.user.upsert({
          where: { annictId: profile.annictId },
          update: {
            username: profile.username,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
            accessToken: account.access_token,
          },
          create: {
            annictId: profile.annictId,
            username: profile.username,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
            accessToken: account.access_token,
          },
        });
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
