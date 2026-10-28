import {
  BookOpenIcon,
  BriefcaseIcon,
  BugIcon,
  CarFrontIcon,
  CloudSunIcon,
  CodeIcon,
  CompassIcon,
  GraduationCapIcon,
  HeartIcon,
  HouseIcon,
  LanguagesIcon,
  LinkIcon,
  LuggageIcon,
  MapIcon,
  MessageCircleIcon,
  MountainIcon,
  MusicIcon,
  PawPrintIcon,
  PlaneIcon,
  ShipIcon,
  ShoppingBasketIcon,
  SunIcon,
  TreePalmIcon,
  UsersIcon,
  UtensilsIcon,
  ZapIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

/**
 * The icons a deck may choose from, by the name used in `data/library.json`.
 *
 * An explicit map rather than a dynamic lookup on the whole lucide package:
 * `import * as icons` would defeat tree-shaking and pull every icon into the
 * bundle for the sake of the two or three a deck actually names.
 */
const DECK_ICONS = {
  "book-open": BookOpenIcon,
  briefcase: BriefcaseIcon,
  bug: BugIcon,
  car: CarFrontIcon,
  "cloud-sun": CloudSunIcon,
  code: CodeIcon,
  compass: CompassIcon,
  "graduation-cap": GraduationCapIcon,
  heart: HeartIcon,
  house: HouseIcon,
  languages: LanguagesIcon,
  link: LinkIcon,
  luggage: LuggageIcon,
  map: MapIcon,
  "message-circle": MessageCircleIcon,
  mountain: MountainIcon,
  music: MusicIcon,
  "paw-print": PawPrintIcon,
  plane: PlaneIcon,
  ship: ShipIcon,
  "shopping-basket": ShoppingBasketIcon,
  sun: SunIcon,
  "tree-palm": TreePalmIcon,
  users: UsersIcon,
  utensils: UtensilsIcon,
  zap: ZapIcon,
} satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type DeckIconName = keyof typeof DECK_ICONS;

export const DECK_ICON_NAMES = Object.keys(DECK_ICONS) as DeckIconName[];

const FALLBACK_ICON = PawPrintIcon;

interface DeckIconProps {
  /** Name from the deck's `icon` field. Unknown or absent falls back. */
  name: string | undefined;
  className?: string;
}

/**
 * An unrecognized name renders the fallback rather than throwing or rendering
 * nothing. Deck data is authored by hand and by workflows, so a typo should cost
 * the deck its icon, not its tile.
 */
export function DeckIcon({ name, className }: DeckIconProps) {
  const Icon = (name && DECK_ICONS[name as DeckIconName]) || FALLBACK_ICON;
  return <Icon className={className} aria-hidden="true" />;
}
