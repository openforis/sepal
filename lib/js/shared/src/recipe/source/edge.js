// The generic source edge.
//
// An edge is one reference a recipe model points at, plus the role that reference plays in producing the
// recipe's output. Roles are opaque here: they are stable values owned by the recipe type that declares
// them, because only that type knows what its execution does with a reference. Generic code carries a role
// through without interpreting it.
//
// `path` records where in the model the reference was read. It is declaration provenance: it makes a
// diagnostic point at a field, and it lets a completeness audit tell a declared reference from one that
// merely looks the same. It is not part of what a resolver matches on.

export const sourceEdge = ({reference, role, path}) => ({reference, role, path})
