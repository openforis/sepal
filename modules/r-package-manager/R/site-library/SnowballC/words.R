# The following code can be used to read vocabulary lists from
# https://github.com/snowballstem/snowball-data
# Manual fixes are needed to replace empty values by ""
for(lang in getStemLanguages()) {
    cat(lang, "\n")
    vocf <- file.path("snowball-data", lang, "voc.txt")
    if(!file.exists(vocf)) vocf <- file.path("snowball-data", lang, "voc.txt.gz")
    outputf <- file.path("snowball-data", lang, "output.txt")
    if(!file.exists(outputf)) outputf <- file.path("snowball-data", lang, "output.txt.gz")
    voc <- readLines(vocf, encoding="UTF-8")
    output <- readLines(outputf, encoding="UTF-8")
    stopifnot(all(wordStem(voc, lang) == output))

    dat <- data.frame(word=voc, stem=output, stringsAsFactors=FALSE)
    # Only keep a subsample of words to reduce space needed for CRAN releases
    dat <- dat[seq(1, nrow(dat), length.out=1000),]
    save(dat, file=file.path("words", paste0(lang, ".RData")), compress="xz")
}
