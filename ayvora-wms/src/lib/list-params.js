// Membaca parameter daftar dari URL (?q=&page=&sort=&dir=&status=...) dengan aman.
// Pengurutan hanya boleh memakai kolom dari daftar putih agar tidak ada SQL injection.

export const DEFAULT_PAGE_SIZE = 10;

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function readListParams(searchParams, { sortable, defaultSort, defaultDir = "asc", pageSize = DEFAULT_PAGE_SIZE, filters = [] }) {
  const page = Math.max(1, parseInt(first(searchParams.page), 10) || 1);
  const q = (first(searchParams.q) ?? "").toString().trim().slice(0, 100);

  const requestedSort = first(searchParams.sort);
  const sort = Object.hasOwn(sortable, requestedSort) ? requestedSort : defaultSort;
  const dir = (first(searchParams.dir) ?? defaultDir) === "desc" ? "desc" : "asc";

  const selected = {};
  for (const name of filters) selected[name] = (first(searchParams[name]) ?? "").toString().trim();

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    q,
    sort,
    dir,
    orderBy: `${sortable[sort]} ${dir === "desc" ? "DESC" : "ASC"}`,
    filters: selected,
  };
}

// Pembantu penyusun klausa WHERE berparameter.
export class WhereBuilder {
  constructor() {
    this.conditions = [];
    this.values = [];
  }

  // Menambah nilai dan mengembalikan placeholder-nya ($1, $2, ...)
  param(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  add(sql) {
    this.conditions.push(sql);
    return this;
  }

  // Contoh: where.addWith("p.category_id = ?", categoryId)
  addWith(sqlWithQuestionMark, value) {
    this.conditions.push(sqlWithQuestionMark.replace("?", this.param(value)));
    return this;
  }

  // Pencarian teks pada beberapa kolom (ILIKE)
  search(columns, text) {
    if (!text) return this;
    const placeholder = this.param(`%${text.replace(/[\\%_]/g, "\\$&")}%`);
    this.conditions.push(`(${columns.map((column) => `${column} ILIKE ${placeholder}`).join(" OR ")})`);
    return this;
  }

  get sql() {
    return this.conditions.length ? `WHERE ${this.conditions.join(" AND ")}` : "";
  }
}

export function pageInfo({ page, pageSize }, total) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page: Math.min(page, totalPages),
    pageSize,
    total,
    totalPages,
    from: total === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
  };
}

// Parameter URL aktif dalam satu objek datar (q, filter, sort, dir) untuk membuat tautan
// pengurutan/pagination yang mempertahankan pencarian dan filter.
export function linkParams(params) {
  return { q: params.q, ...params.filters, sort: params.sort, dir: params.dir };
}
