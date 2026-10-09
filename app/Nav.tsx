import Link from "next/link";
export default function Nav() {
  return (
    <nav className="site" aria-label="Main">
      <Link href="/">BeautyLens</Link><Link href="/analyze">Analyze</Link><Link href="/products">My products and routine</Link>
      <Link href="/compare">Dupes and alternatives</Link><Link href="/reactions">Reaction log</Link><Link href="/report">Report</Link><Link href="/profile">Profile</Link>
    </nav>
  );
}
