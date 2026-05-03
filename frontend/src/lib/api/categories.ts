import { Category } from "@/types";
import { apiFetch } from "./client";

export function getCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/api/category");
}

export function getCategory(id: number): Promise<Category> {
  return apiFetch<Category>(`/api/category/${id}`);
}
