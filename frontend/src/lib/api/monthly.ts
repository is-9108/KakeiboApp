import { Monthly } from "@/types";
import { apiFetch } from "./client";

export function getMonthlies(): Promise<Monthly[]> {
  return apiFetch<Monthly[]>("/api/monthly");
}

export function runMonthEnd(): Promise<unknown> {
  return apiFetch<unknown>("/api/monthly", { method: "POST" });
}
