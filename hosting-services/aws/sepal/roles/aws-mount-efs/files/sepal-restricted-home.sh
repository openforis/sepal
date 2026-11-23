#!/bin/sh
set -eu

source=/data/sepal/home
target=/data/sepal/restricted/home

fail() {
    echo "Restricted homes: $*" >&2
    exit 1
}

[ "$(findmnt -rn -M "$source" -o FSTYPE)" = nfs4 ] || fail "$source is not an NFSv4 mount"
mkdir -p "$target"
if ! mountpoint -q "$target"; then
    mount --bind "$source" "$target"
fi
[ "$(stat -Lc '%d:%i' "$source")" = "$(stat -Lc '%d:%i' "$target")" ] || fail "$target is not a bind of $source"

# A bind mount needs a separate remount to enforce VFS flags; preserve its existing restrictions.
options=$(findmnt -rn -M "$target" -o VFS-OPTIONS)
mount -o "remount,bind,$options,nosymfollow" "$source" "$target"
case ",$(findmnt -rn -M "$target" -o VFS-OPTIONS)," in
    *,nosymfollow,*) ;;
    *) fail "$target lacks nosymfollow" ;;
esac
