import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Database, StoredSubscription, User } from "./types.js";

const initialDb: Database = {
  users: [],
  subscriptions: []
};

export class JsonStore {
  private filePath: string;
  private writeQueue = Promise.resolve();

  constructor(filePath = path.join(process.cwd(), "data", "db.json")) {
    this.filePath = filePath;
  }

  async findUserByEmail(email: string) {
    const db = await this.read();
    return db.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async findUserById(id: string) {
    const db = await this.read();
    return db.users.find((user) => user.id === id) ?? null;
  }

  async createUser(user: User) {
    await this.update((db) => {
      db.users.push(user);
    });
  }

  async upsertSubscription(subscription: StoredSubscription) {
    await this.update((db) => {
      db.subscriptions = db.subscriptions.filter(
        (item) => !(item.userId === subscription.userId && item.endpoint === subscription.endpoint)
      );
      db.subscriptions.push(subscription);
    });
  }

  async getSubscriptionsForUser(userId: string) {
    const db = await this.read();
    return db.subscriptions.filter((item) => item.userId === userId);
  }

  async removeSubscription(id: string) {
    await this.update((db) => {
      db.subscriptions = db.subscriptions.filter((item) => item.id !== id);
    });
  }

  private async read(): Promise<Database> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as Database;
    } catch {
      return structuredClone(initialDb);
    }
  }

  private async update(mutator: (db: Database) => void) {
    this.writeQueue = this.writeQueue.then(async () => {
      const db = await this.read();
      mutator(db);
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(db, null, 2), "utf8");
    });

    await this.writeQueue;
  }
}
