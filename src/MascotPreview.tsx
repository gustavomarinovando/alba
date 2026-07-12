import { Moon, Sparkles, Sun } from "lucide-react";
import { useState, type ComponentType } from "react";

type AppTab = "today" | "calendar" | "chart" | "map" | "ai" | "settings";
type CatKind = "orange" | "black" | "siamese" | "tuxedo";
type Viewport = "mobile" | "tablet" | "desktop";

type CatProps = { kind: CatKind; label: string; className?: string; onReaction?: (reaction: "meow" | "purr") => void };
type PlaygroundProps = { activeTab: AppTab; missingKind?: CatKind };
type WanderProps = { activeTab: AppTab; kind: CatKind };

const tabs: Array<{ id: AppTab; label: string }> = [
  { id: "today", label: "Hoy" }, { id: "calendar", label: "Calendario" }, { id: "chart", label: "Temperatura" },
  { id: "map", label: "Mapa" }, { id: "ai", label: "IA" }, { id: "settings", label: "Ajustes" },
];
const cats: Array<{ id: CatKind; label: string }> = [
  { id: "orange", label: "Mandarino" }, { id: "black", label: "Gatito negro" },
  { id: "siamese", label: "Lynx point" }, { id: "tuxedo", label: "Esmoquin" },
];

export default function MascotPreview({ AnniversaryCat, SideWalkingCat, CatPlayground, WanderingCat }: {
  AnniversaryCat: ComponentType<CatProps>;
  SideWalkingCat: ComponentType<CatProps>;
  CatPlayground: ComponentType<PlaygroundProps>;
  WanderingCat: ComponentType<WanderProps>;
}) {
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [viewport, setViewport] = useState<Viewport>("mobile");
  const [motion, setMotion] = useState(true);
  const [featuredCat, setFeaturedCat] = useState<CatKind>("orange");

  return (
    <main className={`mascot-preview ${theme === "dark" ? "dark" : ""} ${motion ? "" : "mascot-motion-off"}`}>
      <header className="mascot-preview-toolbar">
        <div className="mascot-preview-title"><Sparkles size={18} aria-hidden="true" /><div><strong>Development mascot preview</strong><small>Solo disponible durante desarrollo</small></div></div>
        <div className="mascot-toolbar-group" aria-label="Pestaña de aplicación">{tabs.map((tab) => <button className={activeTab === tab.id ? "active" : ""} key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</div>
        <div className="mascot-toolbar-group" aria-label="Simulación de viewport">{(["mobile", "tablet", "desktop"] as Viewport[]).map((size) => <button className={viewport === size ? "active" : ""} key={size} type="button" onClick={() => setViewport(size)}>{size === "mobile" ? "390×844" : size === "tablet" ? "768×1024" : "1280×900"}</button>)}</div>
        <div className="mascot-toolbar-group"><button type="button" onClick={() => setTheme((value) => value === "light" ? "dark" : "light")}>{theme === "light" ? <Sun size={15} /> : <Moon size={15} />}{theme === "light" ? "Claro" : "Oscuro"}</button><button className={!motion ? "active" : ""} type="button" onClick={() => setMotion((value) => !value)}>{motion ? "Movimiento" : "Estático"}</button></div>
        <label className="mascot-cat-picker">Gato destacado<select value={featuredCat} onChange={(event) => setFeaturedCat(event.target.value as CatKind)}>{cats.map((cat) => <option key={cat.id} value={cat.id}>{cat.label}</option>)}</select></label>
      </header>

      <div className={`mascot-preview-viewport viewport-${viewport}`}>
        <div className="mascot-safe-header"><span>Alba</span><nav aria-label="Navegación simulada">{tabs.slice(0, 4).map((tab) => <i key={tab.id}>{tab.label}</i>)}</nav></div>
        <section className="mascot-preview-content">
          <div className="mascot-preview-heading"><p>Vista de {tabs.find((tab) => tab.id === activeTab)?.label}</p><h1>Una compañía suave, nunca una distracción.</h1></div>
          <CatPlayground activeTab={activeTab} missingKind={featuredCat} />
          <div className="mascot-content-boundaries" aria-label="Límites de contenido interactivo simulados"><div><strong>Contenido principal</strong><span>Formulario, gráfica o datos importantes</span></div><button type="button">Acción segura</button></div>
          <section className="mascot-specimen-grid" aria-label="Todas las identidades de gatos">
            {cats.map((cat) => <article key={cat.id}><AnniversaryCat kind={cat.id} label={cat.label} /><strong>{cat.label}</strong><small>Un toque: miau · doble: ronroneo</small></article>)}
          </section>
          <section className="mascot-walk-specimen"><div><p>Paseo contenido</p><strong>{cats.find((cat) => cat.id === featuredCat)?.label}</strong></div><div className="mascot-walk-lane"><WanderingCat activeTab={activeTab} kind={featuredCat} /></div></section>
          <section className="mascot-anniversary-specimen"><div><p>Momento de aniversario</p><h2>La familia de Alba celebra contigo</h2></div><div className="cat-family playful-scuffle">{cats.map((cat) => <AnniversaryCat key={cat.id} kind={cat.id} label={`${cat.label} celebrando`} />)}</div></section>
          <section className="mascot-side-lineup">{cats.map((cat) => <article key={cat.id}><SideWalkingCat kind={cat.id} label={`${cat.label} caminando`} /><span>{cat.label}</span></article>)}</section>
        </section>
      </div>
    </main>
  );
}
