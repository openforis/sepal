# janeaustenr 0.1.5

* Fixed encoding for *Mansfield Park*
* Added package to calls to data objects, since they are lazy-loaded and not in the namespace

# janeaustenr 0.1.4

* Actually fixed factor order in `austen_books` function to align with publication order

# janeaustenr 0.1.3

* Attempted to fix factor order in `austen_books` function to align with publication order (made an error in this)
* Added unit test to check output of `austen_books`

# janeaustenr 0.1.2

* Moved `dplyr` to Suggests; change implementation of `austen_books` to use base functions thanks to Jeroen Ooms

# janeaustenr 0.1.1

* Added a `NEWS.md` file to track changes to the package.
* Added some details on usage differences between novels to README
* Replaced all data files with new versions to solve problem of formatting change at 10000 lines

# janeaustenr 0.1.0

* Initial release of full texts of Jane Austen's 6 completed, published novels
