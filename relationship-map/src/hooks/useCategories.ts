import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { Category } from "../types.ts";

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);

  const refresh = useCallback(async () => {
    setCategories(await api.listCategories());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { categories, refresh };
}
