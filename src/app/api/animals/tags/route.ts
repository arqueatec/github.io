import { getDb } from "@/db";
import { allTags } from "@/server/services/animals";
import { authed } from "@/server/http";

export const GET = authed(async () => allTags(getDb()));
