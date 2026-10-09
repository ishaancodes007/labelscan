import Link from "next/link";
export default function Nav({ children }: { children?: React.ReactNode }) {
  return (
    <nav className="site" aria-label="Main">
      <Link href="/" className="brand">BeautyLens</Link><Link href="/analyze">Analyze</Link><Link href="/products">My products</Link>
      <Link href="/compare">Dupes and alternatives</Link><Link href="/reactions">Reaction log</Link><Link href="/report">Report</Link><Link href="/profile">Profile</Link><Link href="/about">About</Link>
      <span className="grow" />{children}
    </nav>
  );
}
