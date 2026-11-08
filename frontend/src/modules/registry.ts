import { Activity, FolderKanban, LayoutGrid, type LucideIcon, Settings, Siren } from "lucide-react";

/**
 * Реестр модулей интерфейса. Новый модуль = новая запись здесь
 * + страницы в src/app/(app)/[workspace]/<маршрут>.
 */
export type NavItem = {
  /** путь внутри пространства, "" — главная */
  href: string;
  label: string;
  icon: LucideIcon;
  /** ключ счётчика-бейджа (см. useNavBadges) */
  badge?: "open_incidents";
};

export type ModuleDef = { id: string; label: string; nav: NavItem[] };

export const coreTop: NavItem[] = [{ href: "", label: "Обзор", icon: LayoutGrid }];

export const modules: ModuleDef[] = [
  {
    id: "monitoring",
    label: "Мониторинг",
    nav: [
      { href: "/monitors", label: "Мониторы", icon: Activity },
      { href: "/incidents", label: "Инциденты", icon: Siren, badge: "open_incidents" },
    ],
  },
];

export const coreBottom: ModuleDef = {
  id: "system",
  label: "Система",
  nav: [
    { href: "/projects", label: "Проекты", icon: FolderKanban },
    { href: "/settings", label: "Настройки", icon: Settings },
  ],
};

export const allNav = (): NavItem[] => [...coreTop, ...modules.flatMap((m) => m.nav), ...coreBottom.nav];
