const parseGroups = csv => {
    const groups = JSON.parse(
        csv.split('\n')[1]
            .replaceAll('"', '')
            .replaceAll(/([\w]*)=/g, '"$1": ')
    )
    return {groups}
}

module.exports = {parseGroups}
