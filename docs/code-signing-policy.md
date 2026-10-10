# Code signing policy

*(Page requise par SignPath Foundation ; à publier telle quelle sur la landing page et le README une fois la signature obtenue.)*

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

**Project:** Mine Qubic — https://github.com/iammethod13-design/mine-qubic
**License:** MIT

**Team roles**
- Authors: Pierre-Louis Ballerich (Cointribune)
- Reviewers: Pierre-Louis Ballerich
- Approvers: Pierre-Louis Ballerich

Every release is built automatically by GitHub Actions from the public repository, then manually approved before signing. Only artifacts built from this repository's source are signed.

**Privacy policy:** see `docs/confidentialite.md`. The application sends the user's public Qubic address to the qubic.li mining pool to receive rewards, downloads the official qubic.li client from dl.qubic.li (SHA-256 verified), reads the wallet balance from rpc.qubic.org and the QUBIC price from CoinGecko. Anonymous usage statistics are sent only if the user enables the option in Settings. These transfers are disclosed in the terms shown at first start. The application warns before changing system configuration (launch at Windows startup is an explicit checkbox) and provides an uninstaller.
