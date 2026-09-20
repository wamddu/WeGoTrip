package com.travel.travelbackend.repository;
import com.travel.travelbackend.entity.RefreshCredential;
import org.springframework.data.jpa.repository.*;
import java.util.Optional;
public interface RefreshCredentialRepository extends JpaRepository<RefreshCredential, String> {
    // Scalar projection avoids caching a stale credential before obtaining the user lock.
    @Query("select r.userId from RefreshCredential r where r.digest = :digest")
    Optional<Long> ownerOf(String digest);
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RefreshCredential r where r.digest = :digest")
    Optional<RefreshCredential> findLockedByDigest(String digest);
}
