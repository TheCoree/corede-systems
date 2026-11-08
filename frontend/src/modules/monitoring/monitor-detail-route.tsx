"use client";

import { useParams } from "next/navigation";
import { MonitorDetail } from "./monitor-detail";

export function MonitorDetailRoute() {
  const { id } = useParams<{ id: string }>();
  // key: при переходе между мониторами состояние страницы (диапазон и т.п.) сбрасывается
  return <MonitorDetail key={id} id={id} />;
}
