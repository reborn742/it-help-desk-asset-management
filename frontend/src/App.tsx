import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  LayoutDashboard,
  Ticket,
  Monitor,
  Users,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import "./App.css";

const API = "http://127.0.0.1:8000";

type TicketItem = {
  ticket_id: number;
  title: string;
  description?: string;
  category?: string;
  priority: string;
  status: string;
  requester_id?: number;
  assigned_to?: number | null;
  asset_id?: number | null;
  requester: string;
  assigned_technician: string | null;
};

type Asset = {
  asset_id: number;
  asset_tag: string;
  asset_type: string;
  brand: string | null;
  model: string | null;
  serial_number?: string | null;
  status: string;
};

type User = {
  user_id: number;
  full_name: string;
  email?: string;
  role: string;
  department_id?: number | null;
  is_active?: boolean | number;
};

type Page = "Dashboard" | "Tickets" | "Assets" | "Users";

const inputStyle = {
  width: "100%",
  padding: "10px",
  border: "1px solid #d9dee8",
  borderRadius: "7px",
  boxSizing: "border-box" as const,
  font: "inherit",
};

const primaryButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  padding: "9px 13px",
  border: "none",
  borderRadius: "7px",
  background: "#243b80",
  color: "white",
  cursor: "pointer",
};

const ID_FIELDS = [
  "requester_id",
  "assigned_to",
  "asset_id",
  "department_id",
];

const TICKET_CATEGORIES = [
  "Hardware",
  "Network",
  "Software",
  "Account",
  "Other",
];

const PRIORITIES = ["low", "medium", "high", "critical"];

const TICKET_STATUSES = [
  "open",
  "in_progress",
  "pending",
  "resolved",
  "closed",
];

const ASSET_STATUSES = [
  "available",
  "assigned",
  "maintenance",
  "retired",
];

const USER_ROLES = ["admin", "technician", "employee"];

function validateInteger(
  value: string | undefined,
  label: string,
  required: boolean
): string | null {
  const text = value?.trim() ?? "";

  if (!text) {
    return required ? `${label} is required.` : null;
  }

  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) {
    return `${label} must be a positive whole number (integer).`;
  }

  return null;
}

function validateDate(
  value: string | undefined,
  label: string
): string | null {
  const text = value?.trim() ?? "";

  if (!text) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${label} must use YYYY-MM-DD format.`;
  }

  const parsed = new Date(`${text}T00:00:00Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  ) {
    return `${label} must be a valid calendar date.`;
  }

  return null;
}

function validateForm(
  page: Page,
  form: Record<string, string>,
  editing: boolean
): string | null {
  const required = (key: string, label: string) => {
    if (!form[key]?.trim()) return `${label} is required.`;
    return null;
  };

  if (page === "Tickets") {
    let error = required("title", "Ticket title");
    if (error) return error;

    if (form.title.trim().length > 200) {
      return "Ticket title must not exceed 200 characters.";
    }

    error = required("category", "Category");
    if (error) return error;

    if (!TICKET_CATEGORIES.includes(form.category)) {
      return "Select a valid ticket category.";
    }

    if (!PRIORITIES.includes(form.priority)) {
      return "Select a valid ticket priority.";
    }

    if (
      form.status &&
      !TICKET_STATUSES.includes(form.status.toLowerCase().replaceAll(" ", "_"))
    ) {
      return "Select a valid ticket status.";
    }

    if (!editing) {
      error = validateInteger(
        form.requester_id,
        "Requester user ID",
        true
      );
      if (error) return error;
    }

    error = validateInteger(
      form.assigned_to,
      "Assigned technician user ID",
      false
    );
    if (error) return error;

    error = validateInteger(form.asset_id, "Related asset ID", false);
    if (error) return error;
  }

  if (page === "Assets") {
    let error = required("asset_tag", "Asset tag");
    if (error) return error;

    if (form.asset_tag.trim().length > 50) {
      return "Asset tag must not exceed 50 characters.";
    }

    error = required("asset_type", "Asset type");
    if (error) return error;

    if (!ASSET_STATUSES.includes(form.status)) {
      return "Select a valid asset status.";
    }

    error = validateDate(form.purchase_date, "Purchase date");
    if (error) return error;

    error = validateDate(form.warranty_expiry, "Warranty expiry");
    if (error) return error;
  }

  if (page === "Users") {
    let error = required("full_name", "Full name");
    if (error) return error;

    if (form.full_name.trim().length > 120) {
      return "Full name must not exceed 120 characters.";
    }

    error = required("email", "Email");
    if (error) return error;

    if (form.email.trim().length > 255) {
      return "Email must not exceed 255 characters.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Enter a valid email address, such as name@example.com.";
    }

    if (!USER_ROLES.includes(form.role)) {
      return "Select a valid user role.";
    }

    error = validateInteger(
      form.department_id,
      "Department ID",
      false
    );
    if (error) return error;

    if (!editing && !form.password) {
      return "Password is required when creating a user.";
    }

    if (form.password && form.password.length < 8) {
      return "Password must be at least 8 characters long.";
    }
  }

  return null;
}

function friendlyError(detail: unknown, status: number): string {
  if (Array.isArray(detail)) {
    return detail
      .map((item: { loc?: (string | number)[]; msg?: string; type?: string }) => {
        const location = item.loc
          ?.filter((part) => part !== "body" && part !== "query" && part !== "path")
          .join(" → ");

        let message = item.msg ?? "Invalid value.";

        if (item.type === "missing") {
          message = "This field is required.";
        } else if (item.type === "int_parsing" || item.type === "int_type") {
          message = "Enter a whole number (integer).";
        } else if (item.type === "string_too_short") {
          message = "This value is too short.";
        } else if (item.type === "string_too_long") {
          message = "This value is too long.";
        } else if (item.type === "value_error") {
          message = "Enter a valid value.";
        }

        return location ? `${location}: ${message}` : message;
      })
      .join(" ");
  }

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (status === 400) {
    return "The request was rejected. Check the entered values.";
  }

  if (status === 401) {
    return "Authentication failed. Check your login details.";
  }

  if (status === 403) {
    return "You do not have permission to perform this action.";
  }

  if (status === 404) {
    return "The requested record or API endpoint was not found. Check the ID.";
  }

  if (status === 409) {
    return "This conflicts with existing data. Check for duplicate values or related records.";
  }

  if (status === 422) {
    return "The server rejected one or more fields. Check the entered values.";
  }

  if (status >= 500) {
    return "The server encountered an error. Check the backend terminal for the exact cause.";
  }

  return `Request failed (HTTP ${status}).`;
}

function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [changes, setChanges] = useState<
    Record<number, { status: string; priority: string }>
  >({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TicketItem | Asset | User | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(path: string, options?: RequestInit) {
    let response: Response;

    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
          ...(options?.body ? { "Content-Type": "application/json" } : {}),
          ...options?.headers,
        },
      });
    } catch {
      throw new Error(
        "Cannot connect to the backend. Make sure FastAPI is running at http://127.0.0.1:8000."
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(friendlyError(body?.detail, response.status));
    }

    if (response.status === 204) return null;

    if (response.status === 205) return null;

    return response.json();
  }

  async function loadData() {
    setError("");

    try {
      const [t, a, u] = await Promise.all([
        request("/tickets"),
        request("/assets"),
        request("/users"),
      ]);

      if (!Array.isArray(t) || !Array.isArray(a) || !Array.isArray(u)) {
        throw new Error(
          "The backend returned unexpected data. Check the API response."
        );
      }

      setTickets(t);
      setAssets(a);
      setUsers(u);
      setChanges({});
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load records."
      );
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function startCreate() {
    setEditing(null);

    if (page === "Tickets") {
      setForm({
        title: "",
        description: "",
        category: "",
        priority: "medium",
        status: "open",
        requester_id: "",
        assigned_to: "",
        asset_id: "",
      });
    } else if (page === "Assets") {
      setForm({
        asset_tag: "",
        asset_type: "",
        brand: "",
        model: "",
        serial_number: "",
        status: "available",
        purchase_date: "",
        warranty_expiry: "",
      });
    } else if (page === "Users") {
      setForm({
        full_name: "",
        email: "",
        role: "employee",
        department_id: "",
        is_active: "true",
        password: "",
      });
    } else {
      setForm({});
    }

    setFormOpen(true);
    setMessage("");
    setError("");
  }

  function startEdit(item: TicketItem | Asset | User) {
    setEditing(item);

    setForm(
      Object.fromEntries(
        Object.entries(item).map(([key, value]) => [
          key,
          value == null ? "" : String(value),
        ])
      )
    );

    setFormOpen(true);
    setMessage("");
    setError("");
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm({});
  }

  function setField(name: string, value: string) {
    setForm((old) => ({ ...old, [name]: value }));

    // Clear the old message while the user corrects their input.
    setError("");
  }

  function field(
    name: string,
    label: string,
    options?: string[],
    required = false
  ) {
    const isId = ID_FIELDS.includes(name);
    const isDate = name === "purchase_date" || name === "warranty_expiry";

    return (
      <label key={name} style={{ display: "grid", gap: "6px" }}>
        <span>{label}{required ? " *" : ""}</span>

        {options ? (
          <select
            required={required}
            value={form[name] ?? ""}
            onChange={(e) => setField(name, e.target.value)}
            style={inputStyle}
          >
            <option value="">Select {label.toLowerCase()}</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={
              name === "password"
                ? "password"
                : name === "email"
                  ? "email"
                  : isId
                    ? "number"
                    : isDate
                      ? "date"
                      : "text"
            }
            min={isId ? 1 : undefined}
            step={isId ? 1 : undefined}
            maxLength={
              name === "title"
                ? 200
                : name === "asset_tag"
                  ? 50
                  : name === "full_name"
                    ? 120
                    : name === "email"
                      ? 255
                      : undefined
            }
            required={required}
            value={form[name] ?? ""}
            onChange={(e) => setField(name, e.target.value)}
            style={inputStyle}
          />
        )}
      </label>
    );
  }

  async function saveForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setMessage("");

    const validationError = validateForm(page, form, Boolean(editing));

    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);

    try {
      let path = "";
      let payload: Record<string, unknown> = {};
      let id = "";

      if (page === "Tickets") {
        path = "/tickets";
        id = "ticket_id";

        payload = {
          title: form.title.trim(),
          description: form.description?.trim() || "",
          category: form.category,
          priority: form.priority,
          status: (form.status || "open").toLowerCase().replaceAll(" ", "_"),
        };

        if (!editing) {
          payload.requester_id = Number(form.requester_id);
        }

        payload.assigned_to = form.assigned_to
          ? Number(form.assigned_to)
          : null;

        payload.asset_id = form.asset_id
          ? Number(form.asset_id)
          : null;
      } else if (page === "Assets") {
        path = "/assets";
        id = "asset_id";

        payload = {
          asset_tag: form.asset_tag.trim(),
          asset_type: form.asset_type.trim(),
          brand: form.brand?.trim() || null,
          model: form.model?.trim() || null,
          serial_number: form.serial_number?.trim() || null,
          status: form.status,
          purchase_date: form.purchase_date || null,
          warranty_expiry: form.warranty_expiry || null,
        };
      } else if (page === "Users") {
        path = "/users";
        id = "user_id";

        payload = {
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          role: form.role,
          department_id: form.department_id
            ? Number(form.department_id)
            : null,
          is_active: form.is_active !== "false",
        };

        if (form.password) {
          payload.password = form.password;
        }
      } else {
        throw new Error("Select Tickets, Assets, or Users before saving.");
      }

      if (editing) {
        const recordId = (editing as unknown as Record<string, number>)[id];

        if (page === "Users" && !form.password) {
          delete payload.password;
        }

        await request(`${path}/${recordId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        if (page === "Users" && !form.password) {
          throw new Error("Password is required when creating a user.");
        }

        await request(path, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      closeForm();

      const noun =
        page === "Tickets"
          ? "Ticket"
          : page === "Assets"
            ? "Asset"
            : "User";

      setMessage(`${noun} ${editing ? "updated" : "created"} successfully.`);

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save the record. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecord(kind: Page, id: number) {
    if (
      !window.confirm(
        `Delete this ${kind === "Tickets" ? "ticket" : kind === "Assets" ? "asset" : "user"}? This cannot be undone.`
      )
    ) {
      return;
    }

    setError("");
    setMessage("");

    try {
      const endpoint =
        kind === "Tickets"
          ? `/tickets/${id}`
          : kind === "Assets"
            ? `/assets/${id}`
            : `/users/${id}`;

      await request(endpoint, { method: "DELETE" });

      setMessage("Record deleted successfully.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete the record."
      );
    }
  }

  async function saveTicket(ticket: TicketItem) {
    const update = changes[ticket.ticket_id];
    if (!update) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await request(`/tickets/${ticket.ticket_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: update.status.toLowerCase().replaceAll(" ", "_"),
          priority: update.priority,
        }),
      });

      setMessage(`Ticket #${ticket.ticket_id} updated successfully.`);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update the ticket."
      );
    } finally {
      setBusy(false);
    }
  }

  const openCount = tickets.filter((t) => t.status === "open").length;
  const progressCount = tickets.filter((t) => t.status === "in_progress").length;

  function navItem(label: Page, icon: ReactNode) {
    return (
      <button
        key={label}
        type="button"
        className={`nav-item ${page === label ? "active" : ""}`}
        onClick={() => {
          setPage(label);
          closeForm();
          setMessage("");
          setError("");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          background: page === label ? "rgba(255,255,255,.12)" : "transparent",
          color: "inherit",
          border: 0,
          font: "inherit",
        }}
      >
        {icon}
        {label}
      </button>
    );
  }

  function managementTable() {
    if (page === "Tickets") {
      return (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Requester</th>
                <th>Assigned technician</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const current = changes[t.ticket_id] ?? {
                  status: t.status,
                  priority: t.priority,
                };

                return (
                  <tr key={t.ticket_id}>
                    <td>
                      <strong>#{t.ticket_id}</strong>
                      <div className="ticket-title">{t.title}</div>
                    </td>
                    <td>{t.requester}</td>
                    <td>{t.assigned_technician || "Unassigned"}</td>
                    <td>
                      <select
                        value={current.priority}
                        onChange={(e) =>
                          setChanges((old) => ({
                            ...old,
                            [t.ticket_id]: {
                              ...current,
                              priority: e.target.value,
                            },
                          }))
                        }
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={current.status}
                        onChange={(e) =>
                          setChanges((old) => ({
                            ...old,
                            [t.ticket_id]: {
                              ...current,
                              status: e.target.value,
                            },
                          }))
                        }
                      >
                        {TICKET_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button
                          className="refresh"
                          disabled={busy}
                          onClick={() => void saveTicket(t)}
                        >
                          <Save size={14} /> Save
                        </button>
                        <button
                          className="refresh"
                          onClick={() => startEdit(t)}
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          className="refresh"
                          onClick={() => void deleteRecord("Tickets", t.ticket_id)}
                          aria-label={`Delete ticket ${t.ticket_id}`}
                          title="Delete ticket"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {tickets.length === 0 && <p className="empty">No tickets found.</p>}
        </div>
      );
    }

    if (page === "Assets") {
      return (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asset tag</th>
                <th>Type</th>
                <th>Brand / Model</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.asset_id}>
                  <td><strong>{a.asset_tag}</strong></td>
                  <td>{a.asset_type}</td>
                  <td>{[a.brand, a.model].filter(Boolean).join(" ") || "—"}</td>
                  <td>{a.status}</td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="refresh" onClick={() => startEdit(a)}>
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        className="refresh"
                        onClick={() => void deleteRecord("Assets", a.asset_id)}
                        aria-label={`Delete asset ${a.asset_id}`}
                        title="Delete asset"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {assets.length === 0 && <p className="empty">No assets found.</p>}
        </div>
      );
    }

    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td><strong>{u.full_name}</strong></td>
                <td>{u.email || "—"}</td>
                <td>{u.role}</td>
                <td>{u.is_active === false || u.is_active === 0 ? "No" : "Yes"}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button className="refresh" onClick={() => startEdit(u)}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      className="refresh"
                      onClick={() => void deleteRecord("Users", u.user_id)}
                      aria-label={`Delete user ${u.user_id}`}
                      title="Delete user"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && <p className="empty">No users found.</p>}
      </div>
    );
  }

  function renderForm() {
    if (!formOpen) return null;

    return (
      <form
        onSubmit={saveForm}
        style={{
          padding: "20px",
          border: "1px solid #e0e5ee",
          borderRadius: "10px",
          marginBottom: "20px",
          display: "grid",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>
            {editing ? "Edit" : "Create"}{" "}
            {page === "Tickets" ? "Ticket" : page === "Assets" ? "Asset" : "User"}
          </h3>
          <button type="button" className="refresh" onClick={closeForm}>
            <X size={16} /> Cancel
          </button>
        </div>

        {page === "Tickets" && (
          <>
            {field("title", "Title", undefined, true)}
            {field("description", "Description")}
            {field("category", "Category", TICKET_CATEGORIES, true)}
            {field("priority", "Priority", PRIORITIES, true)}
            {field("status", "Status", TICKET_STATUSES, true)}
            {!editing && field("requester_id", "Requester user ID", undefined, true)}
            {field("assigned_to", "Assigned technician user ID (optional)")}
            {field("asset_id", "Related asset ID (optional)")}
          </>
        )}

        {page === "Assets" && (
          <>
            {field("asset_tag", "Asset tag", undefined, true)}
            {field("asset_type", "Asset type", undefined, true)}
            {field("brand", "Brand")}
            {field("model", "Model")}
            {field("serial_number", "Serial number")}
            {field("status", "Status", ASSET_STATUSES, true)}
            {field("purchase_date", "Purchase date")}
            {field("warranty_expiry", "Warranty expiry")}
          </>
        )}

        {page === "Users" && (
          <>
            {field("full_name", "Full name", undefined, true)}
            {field("email", "Email", undefined, true)}
            {field("role", "Role", USER_ROLES, true)}
            {field("department_id", "Department ID (optional)")}
            {field("is_active", "Active", ["true", "false"], true)}
            {field(
              "password",
              editing ? "New password (leave blank to keep current)" : "Password",
              undefined,
              !editing
            )}
            <p style={{ margin: 0, fontSize: "13px", color: "#667085" }}>
              Password must contain at least 8 characters.
            </p>
          </>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            ...primaryButton,
            justifyContent: "center",
            opacity: busy ? 0.7 : 1,
          }}
        >
          <Save size={16} /> {busy ? "Saving..." : "Save record"}
        </button>
      </form>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">H</span> HelpDesk
          <span className="brand-dot">.</span>
        </div>

        <p className="nav-label">WORKSPACE</p>

        {navItem("Dashboard", <LayoutDashboard size={18} />)}
        {navItem("Tickets", <Ticket size={18} />)}
        {navItem("Assets", <Monitor size={18} />)}
        {navItem("Users", <Users size={18} />)}

        <div className="sidebar-bottom">
          IT Help Desk<br />
          <span>Asset Management System</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">WORKSPACE / {page.toUpperCase()}</span>
            <h1>{page}</h1>
          </div>

          <button
            className="refresh"
            onClick={() => void loadData()}
            disabled={busy}
          >
            <RefreshCw size={16} /> Refresh data
          </button>
        </header>

        {error && (
          <div className="error" role="alert" aria-live="assertive">
            <strong>Unable to complete the operation:</strong> {error}
          </div>
        )}

        {message && (
          <div className="success-message" role="status" aria-live="polite">
            {message}
          </div>
        )}

        {page === "Dashboard" ? (
          <>
            <section className="welcome">
              <div>
                <span className="eyebrow light">IT OPERATIONS</span>
                <h2>Help desk overview</h2>
                <p>Monitor support requests and keep track of company assets.</p>
              </div>
              <div className="welcome-mark">H<span>.</span></div>
            </section>

            <section className="stats">
              <article className="stat-card">
                <span>Total tickets</span>
                <Ticket />
                <strong>{tickets.length}</strong>
                <small>All recorded requests</small>
              </article>

              <article className="stat-card">
                <span>Open tickets</span>
                <span className="status-dot orange" />
                <strong>{openCount}</strong>
                <small>Awaiting resolution</small>
              </article>

              <article className="stat-card">
                <span>In progress</span>
                <span className="status-dot blue" />
                <strong>{progressCount}</strong>
                <small>Being worked on</small>
              </article>

              <article className="stat-card">
                <span>Registered assets</span>
                <Monitor />
                <strong>{assets.length}</strong>
                <small>Tracked equipment</small>
              </article>
            </section>

            <section className="content-grid">
              <article className="panel tickets-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Recent tickets</h3>
                    <p>Latest support requests</p>
                  </div>
                  <button
                    className="refresh"
                    onClick={() => {
                      setPage("Tickets");
                      setError("");
                      setMessage("");
                    }}
                  >
                    View all
                  </button>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Requester</th>
                        <th>Priority</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.slice(0, 6).map((t) => (
                        <tr key={t.ticket_id}>
                          <td>
                            <strong>#{t.ticket_id}</strong>
                            <div className="ticket-title">{t.title}</div>
                          </td>
                          <td>{t.requester}</td>
                          <td>{t.priority}</td>
                          <td>{t.status.replaceAll("_", " ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel side-panel">
                <div className="panel-heading">
                  <div>
                    <h3>System snapshot</h3>
                    <p>Current database records</p>
                  </div>
                </div>

                <div className="snapshot-row">
                  <span className="snapshot-icon"><Users size={18} /></span>
                  <div>
                    <strong>{users.length}</strong>
                    <p>Registered users</p>
                  </div>
                </div>

                <div className="snapshot-row">
                  <span className="snapshot-icon"><Monitor size={18} /></span>
                  <div>
                    <strong>{assets.filter((a) => a.status === "available").length}</strong>
                    <p>Available assets</p>
                  </div>
                </div>

                <div className="snapshot-row">
                  <span className="snapshot-icon"><Ticket size={18} /></span>
                  <div>
                    <strong>
                      {tickets.filter((t) => !["closed", "resolved"].includes(t.status)).length}
                    </strong>
                    <p>Unresolved tickets</p>
                  </div>
                </div>
              </article>
            </section>
          </>
        ) : (
          <section className="panel">
            <div className="panel-heading" style={{ flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h3>{page} management</h3>
                <p>View and manage database records</p>
              </div>

              <button
                style={primaryButton}
                onClick={startCreate}
                disabled={busy}
              >
                <Plus size={16} /> Add{" "}
                {page === "Tickets" ? "Ticket" : page === "Assets" ? "Asset" : "User"}
              </button>
            </div>

            {renderForm()}
            {managementTable()}
          </section>
        )}

        <footer>
          HELPDESK SYSTEM <span>•</span> React + FastAPI + MySQL
        </footer>
      </main>
    </div>
  );
}

export default App;