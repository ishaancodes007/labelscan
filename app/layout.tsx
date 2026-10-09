export const metadata = { title: "BeautyLens", description: "Explain cosmetic ingredient labels" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
