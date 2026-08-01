import NextAuth from "next-auth";
import type { OAuthConfig } from "next-auth/providers";
import { prisma } from "@/lib/prisma";

interface AnnictProfile {
  annictId: number;
  username: string;
  name: string;
  avatarUrl: string | null;
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
    params: { scope: "read" },
  },
  token: "https://api.annict.com/oauth/token",
  userinfo: {
    url: "https://api.annict.com/graphql",
    async request({ tokens }: { tokens: { access_token?: string } }) {
      const response = await fetch("https://api.annict.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({ query: VIEWER_QUERY }),
      });
      const json = (await response.json()) as { data: { viewer: AnnictProfile } };
      return json.data.viewer as AnnictProfile;
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
    async signIn({ profile, account }) {
      const annictProfile = profile as AnnictProfile | undefined;
      const accessToken = account?.access_token;
      if (!annictProfile || !accessToken) {
        return false;
      }

      await prisma.user.upsert({
        where: { annictId: annictProfile.annictId },
        update: {
          username: annictProfile.username,
          name: annictProfile.name,
          avatarUrl: annictProfile.avatarUrl,
          accessToken,
        },
        create: {
          annictId: annictProfile.annictId,
          username: annictProfile.username,
          name: annictProfile.name,
          avatarUrl: annictProfile.avatarUrl,
          accessToken,
        },
      });

      return true;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
