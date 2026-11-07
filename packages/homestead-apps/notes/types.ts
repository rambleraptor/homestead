export interface Note {
  id: string;
  /** AEP-122 resource name: `users/{uid}/notes/{id}`. */
  path: string;
  body: string;
  struck?: boolean;
  /** When it was written, by the writer's clock (older notes may lack it). */
  written_at?: string;
  create_time: string;
  update_time: string;
}

export interface NoteFormData {
  body: string;
  struck?: boolean;
  written_at?: string;
}
