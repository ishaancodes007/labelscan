import "./globals.css";
import MotionToggle from "./MotionToggle";
import Nav from "./Nav";

export const metadata = { title: "BeautyLens", description: "Read a cosmetic ingredient label, understand each name, and check it against rules you set. No scores, no verdicts." };

// Runs before first paint: applies the saved (or system) motion preference so there is no flash of animation. localStorage is wrapped in try/catch.
const MOTION_INIT = `try{var m=localStorage.getItem("beautylens.motion");if(m!=="reduce"&&m!=="full"){m=window.matchMedia("(prefers-reduced-motion: reduce)").matches?"reduce":"full"}document.documentElement.dataset.motion=m}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: MOTION_INIT }} /></head>
      <body><a className="skip" href="#content">Skip to content</a><Nav><MotionToggle /></Nav><div id="content">{children}</div></body>
    </html>
  );
}
