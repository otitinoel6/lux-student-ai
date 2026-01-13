import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@getmocha/users-service/react";
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save,
  Sparkles,
  FileText,
  Tag,
  BookOpen
} from "lucide-react";

interface Note {
  id: number;
  title: string;
  content: string;
  subject?: string;
  tags?: string;
  created_at: string;
  updated_at: string;
}

export default function Notes() {
  const { user, isPending } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [editedSubject, setEditedSubject] = useState("");
  const [editedTags, setEditedTags] = useState("");

  useEffect(() => {
    if (!isPending && !user) {
      navigate("/");
    }
  }, [user, isPending, navigate]);

  useEffect(() => {
    if (user) {
      loadNotes();
    }
  }, [user]);

  const loadNotes = async () => {
    try {
      const response = await fetch("/api/notes");
      const data = await response.json();
      setNotes(data);
    } catch (error) {
      console.error("Failed to load notes:", error);
    }
  };

  const createNewNote = async () => {
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Note",
          content: "",
          subject: "",
          tags: "",
        }),
      });
      const newNote = await response.json();
      setNotes([newNote, ...notes]);
      setSelectedNote(newNote);
      setIsEditing(true);
      setEditedTitle(newNote.title);
      setEditedContent(newNote.content);
      setEditedSubject(newNote.subject || "");
      setEditedTags(newNote.tags || "");
    } catch (error) {
      console.error("Failed to create note:", error);
    }
  };

  const saveNote = async () => {
    if (!selectedNote) return;

    try {
      const response = await fetch(`/api/notes/${selectedNote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editedTitle,
          content: editedContent,
          subject: editedSubject,
          tags: editedTags,
        }),
      });
      const updatedNote = await response.json();
      setNotes(notes.map((n) => (n.id === updatedNote.id ? updatedNote : n)));
      setSelectedNote(updatedNote);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save note:", error);
    }
  };

  const deleteNote = async (id: number) => {
    try {
      await fetch(`/api/notes/${id}`, { method: "DELETE" });
      setNotes(notes.filter((n) => n.id !== id));
      if (selectedNote?.id === id) {
        setSelectedNote(null);
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  const selectNote = (note: Note) => {
    setSelectedNote(note);
    setIsEditing(false);
    setEditedTitle(note.title);
    setEditedContent(note.content);
    setEditedSubject(note.subject || "");
    setEditedTags(note.tags || "");
  };

  const startEditing = () => {
    setIsEditing(true);
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-pulse text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-slate-950 text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-purple-400 hover:text-purple-300 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Chat
          </button>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold">My Notes</h1>
          </div>
          <button
            onClick={createNewNote}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Note
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`group relative p-4 rounded-lg cursor-pointer transition-colors ${
                selectedNote?.id === note.id
                  ? "bg-purple-600/20 border border-purple-500/30"
                  : "bg-slate-800/50 hover:bg-slate-800"
              }`}
              onClick={() => selectNote(note)}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold truncate flex-1">{note.title}</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNote(note.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-600/20 rounded transition-opacity"
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              </div>
              {note.subject && (
                <div className="flex items-center gap-1 text-xs text-purple-400 mb-1">
                  <BookOpen className="w-3 h-3" />
                  {note.subject}
                </div>
              )}
              {note.tags && (
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Tag className="w-3 h-3" />
                  {note.tags}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-2">
                {new Date(note.updated_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Note Area */}
      <div className="flex-1 flex flex-col">
        {selectedNote ? (
          <>
            {/* Header */}
            <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-purple-500"
                    placeholder="Note title..."
                  />
                ) : (
                  <h2 className="text-2xl font-bold">{selectedNote.title}</h2>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <button
                    onClick={saveNote}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                ) : (
                  <button
                    onClick={startEditing}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Metadata */}
            {isEditing && (
              <div className="bg-slate-900 border-b border-slate-800 p-4 flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">Subject</label>
                  <input
                    type="text"
                    value={editedSubject}
                    onChange={(e) => setEditedSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-purple-500 text-sm"
                    placeholder="e.g., Mathematics, Physics, History..."
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">Tags</label>
                  <input
                    type="text"
                    value={editedTags}
                    onChange={(e) => setEditedTags(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-purple-500 text-sm"
                    placeholder="calculus, exam-prep, chapter-5..."
                  />
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isEditing ? (
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full h-full px-6 py-4 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-purple-500 resize-none"
                  placeholder="Start taking notes..."
                />
              ) : (
                <div className="prose prose-invert max-w-none">
                  <div className="whitespace-pre-wrap text-slate-200 leading-relaxed">
                    {selectedNote.content || "No content yet. Click Edit to start writing."}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Sparkles className="w-16 h-16 text-purple-400 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No Note Selected</h2>
            <p className="text-slate-400 max-w-md mb-6">
              Select a note from the sidebar or create a new one to get started.
            </p>
            <button
              onClick={createNewNote}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Your First Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
