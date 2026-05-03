import { Subscription } from "@/types";
import { apiFetch } from "./client";

export function getSubscriptions(): Promise<Subscription[]> {
  return apiFetch<Subscription[]>("/api/subscription");
}

export function getSubscription(id: number): Promise<Subscription> {
  return apiFetch<Subscription>(`/api/subscription/${id}`);
}

export function createSubscription(data: {
  Name: string;
  Amount: number;
}): Promise<Subscription> {
  return apiFetch<Subscription>("/api/subscription", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateSubscription(data: {
  id: number;
  name: string;
  amount: number;
}): Promise<Subscription> {
  return apiFetch<Subscription>(`/api/subscription/${data.id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteSubscription(id: number): Promise<void> {
  return apiFetch<void>(`/api/subscription/${id}`, { method: "DELETE" });
}
