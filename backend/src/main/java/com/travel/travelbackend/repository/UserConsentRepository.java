package com.travel.travelbackend.repository;
import com.travel.travelbackend.entity.UserConsent;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface UserConsentRepository extends JpaRepository<UserConsent, Long> {
    List<UserConsent> findByUserIdOrderByAgreedAtDescIdDesc(Long userId);
}
