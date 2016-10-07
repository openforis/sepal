package org.openforis.sepal.apigateway.server

import org.apache.http.ssl.SSLContextBuilder
import org.bouncycastle.asn1.pkcs.PrivateKeyInfo
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.openssl.PEMDecryptorProvider
import org.bouncycastle.openssl.PEMEncryptedKeyPair
import org.bouncycastle.openssl.PEMKeyPair
import org.bouncycastle.openssl.PEMParser
import org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter
import org.bouncycastle.openssl.jcajce.JcePEMDecryptorProviderBuilder

import javax.net.ssl.KeyManager
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import java.security.KeyFactory
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Security
import java.security.cert.Certificate
import java.security.cert.CertificateFactory
import java.security.spec.RSAPrivateCrtKeySpec

class SslContextFactory {
    static final create(File keyFile, File certificateFile) {
        def certificates = loadCertificates(certificateFile)
        def privateKey = loadPrivateKey(keyFile)
        def keyManagers = createKeyManagers(privateKey, certificates)
        return createSslContext(keyManagers)
    }

    private static SSLContext createSslContext(KeyManager[] keyManagers) {
        def sslContext = SSLContext.getInstance("TLS")
        sslContext.init(keyManagers, null, null)
        sslContext
    }

    private static Collection<? extends Certificate> loadCertificates(File certificateFile) {
        return new FileInputStream(certificateFile).withStream {
            CertificateFactory.getInstance('X.509').generateCertificates(it)
        }
    }

    private static KeyManager[] createKeyManagers(
            PrivateKey privateKey,
            Collection<? extends Certificate> certificates) {
        KeyStore keyStore = createKeyStore()
        keyStore.setEntry('sepal-https',
                new KeyStore.PrivateKeyEntry(privateKey, certificates as Certificate[]),
                new KeyStore.PasswordProtection(''.toCharArray())
        )
        def keyManagerFactory = KeyManagerFactory.getInstance(
                KeyManagerFactory.getDefaultAlgorithm())
        keyManagerFactory.init(keyStore, ''.toCharArray())
        return keyManagerFactory.keyManagers
    }

    private static KeyStore createKeyStore() {
        def keyStore = KeyStore.getInstance(KeyStore.defaultType)
        keyStore.load(null) // You don't need the KeyStore instance to come from a file.
        return keyStore
    }

    private static PrivateKey loadPrivateKey(File keyFile) {
        Security.addProvider(new BouncyCastleProvider())
        def converter = new JcaPEMKeyConverter().setProvider("BC")
        def parsedKey = new PEMParser(new FileReader(keyFile)).readObject()
        PrivateKeyInfo privateKeyInfo
        if (parsedKey instanceof PEMEncryptedKeyPair)
            privateKeyInfo = keyInfoFromEncryptedKeyPair(parsedKey)
        else if (parsedKey instanceof PEMKeyPair)
            privateKeyInfo = (parsedKey as PEMKeyPair).privateKeyInfo
        else if (parsedKey instanceof PrivateKeyInfo)
            privateKeyInfo = parsedKey as PrivateKeyInfo
        else
            throw new IllegalStateException("Unsupported private key type: " + parsedKey)

        def privateKey = converter.getPrivateKey(privateKeyInfo)
        def rsaPrivateKey = KeyFactory.getInstance("RSA").getKeySpec(privateKey, RSAPrivateCrtKeySpec.class)
        return KeyFactory.getInstance("RSA").generatePrivate(rsaPrivateKey)

    }

    private static PrivateKeyInfo keyInfoFromEncryptedKeyPair(PEMEncryptedKeyPair parsedKey) {
        PEMEncryptedKeyPair ckp = (PEMEncryptedKeyPair) parsedKey
        PEMDecryptorProvider decProv = new JcePEMDecryptorProviderBuilder().build(null)
        def pemKeyPair = ckp.decryptKeyPair(decProv)
        return pemKeyPair.privateKeyInfo
    }
}
