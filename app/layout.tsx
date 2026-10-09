import "./globals.css";
import Nav from "./Nav";
export const metadata = { title: "BeautyLens", description: "Explain cosmetic ingredient labels" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><Nav />{children}</body></html>);
}
