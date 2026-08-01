"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "トップ" },
  { href: "/tools/watched-list", label: "視聴済みリスト" },
  { href: "/tools/common-works", label: "共通項チェッカー" },
];

export default function ToolNav() {
  const pathname = usePathname();

  return (
    <nav className="tool-nav">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={pathname === link.href ? "active" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
