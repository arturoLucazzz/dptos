/** The owner's settings. A new setting adds one entry here and one route under /configuracion. */
export const SETTINGS_SECTIONS: { href: string; label: string; description: string }[] = [
  {
    href: "/configuracion/duplicados",
    label: "Duplicados",
    description: "Avisos que pueden ser la misma propiedad en dos portales.",
  },
];
