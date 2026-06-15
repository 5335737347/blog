import Header from "@/components/public/Header";
import Footer from "@/components/public/Footer";
import FallingEffects from "@/components/public/FallingEffects";
import BackToTop from "@/components/public/BackToTop";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <FallingEffects />
      <BackToTop />
    </>
  );
}
