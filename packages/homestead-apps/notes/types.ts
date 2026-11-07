export interface Note {
  id: string;
  /** AEP-122 resource name: `users/{uid}/notes/{id}`. */
  path: string;
  body: string;
  struck?: boolean;
  create_time: string;
  update_time: string;
}

export interface NoteFormData {
  body: string;
  struck?: boolean;
}
