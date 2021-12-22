# tokenizers 0.2.1

- Add citation information to JOSS paper.

# tokenizers 0.2.0

## Features

- Add the `tokenize_ptb()` function for Penn Treebank tokenizations (@jrnold) (#12).
- Add a function `chunk_text()` to split long documents into pieces (#30).
- New functions to count words, characters, and sentences without tokenization (#36).
- New function `tokenize_tweets()` preserves usernames, hashtags, and URLS (@kbenoit) (#44).
- The `stopwords()` function has been removed in favor of using the **stopwords** package (#46).
- The package now complies with the basic recommendations of the **Text Interchange Format**. All tokenization functions are now methods. This enables them to take corpus inputs as either TIF-compliant named character vectors, named lists, or data frames. All outputs are still named lists of tokens, but these can be easily coerced to data frames of tokens using the `tif` package. (#49)
- Add a new vignette "The Text Interchange Formats and the tokenizers Package" (#49).

## Bug fixes and performance improvements

- `tokenize_skip_ngrams` has been improved to generate unigrams and bigrams, according to the skip definition (#24).
- C++98 has replaced the C++11 code used for n-gram generation, widening the range of compilers `tokenizers` supports (@ironholds) (#26).
- `tokenize_skip_ngrams` now supports stopwords (#31).
- If tokenisers fail to generate tokens for a particular entry, they return `NA` consistently (#33).
- Keyboard interrupt checks have been added to Rcpp-backed functions to enable users to terminate them before completion (#37).
- `tokenize_words()` gains arguments to preserve or strip punctuation and numbers (#48).
- `tokenize_skip_ngrams()` and `tokenize_ngrams()` to return properly marked UTF8 strings on Windows (@patperry) (#58).

# tokenizers 0.1.4

- Add the `tokenize_character_shingles()` tokenizer.
- Improvements to documentation.

# tokenizers 0.1.3

- Add vignette.
- Improvements to n-gram tokenizers.

# tokenizers 0.1.2

- Add stopwords for several languages.
- New stopword options to `tokenize_words()` and `tokenize_word_stems()`.

# tokenizers 0.1.1

- Fix failing test in non-UTF-8 locales.

# tokenizers 0.1.0

- Initial release with tokenizers for characters, words, word stems, sentences
  paragraphs, n-grams, skip n-grams, lines, and regular expressions.
