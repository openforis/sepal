## ----setup, include = FALSE----------------------------------------------
knitr::opts_chunk$set(
  collapse = TRUE,
  comment = "#>"
)

## ------------------------------------------------------------------------
# Named list
(corpus_l <- list(man_comes_around = "There's a man goin' 'round takin' names",
                  wont_back_down = "Well I won't back down, no I won't back down",
                  bird_on_a_wire = "Like a bird on a wire"))

# Named character vector
(corpus_c <- unlist(corpus_l))

# Data frame
(corpus_d <- data.frame(doc_id = names(corpus_c), text = unname(corpus_c),
                        stringsAsFactors = FALSE))

## ------------------------------------------------------------------------
library(tokenizers)

tokens_l <- tokenize_ngrams(corpus_l, n = 2)
tokens_c <- tokenize_ngrams(corpus_c, n = 2)
tokens_d <- tokenize_ngrams(corpus_c, n = 2)

# Are all these identical?
all(identical(tokens_l, tokens_c),
    identical(tokens_c, tokens_d),
    identical(tokens_l, tokens_d))

## ------------------------------------------------------------------------
tokens_l

## ---- echo=FALSE---------------------------------------------------------
sample_tokens_df <- structure(list(doc_id = c("man_comes_around", "man_comes_around", 
"man_comes_around", "man_comes_around", "man_comes_around", "man_comes_around", 
"wont_back_down", "wont_back_down", "wont_back_down", "wont_back_down", 
"wont_back_down", "wont_back_down", "wont_back_down", "wont_back_down", 
"wont_back_down", "bird_on_a_wire", "bird_on_a_wire", "bird_on_a_wire", 
"bird_on_a_wire", "bird_on_a_wire"), token = c("there's a", "a man", 
"man goin", "goin round", "round takin", "takin names", "well i", 
"i won't", "won't back", "back down", "down no", "no i", "i won't", 
"won't back", "back down", "like a", "a bird", "bird on", "on a", 
"a wire")), .Names = c("doc_id", "token"), row.names = c(NA, 
-20L), class = "data.frame")
head(sample_tokens_df, 10)

