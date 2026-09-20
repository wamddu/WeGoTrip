package com.travel.travelbackend.entity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
@Entity @Table(name = "user_setting") @Getter @NoArgsConstructor
public class UserSetting {
    @Id private Long userId;
    @MapsId @OneToOne(optional = false) @JoinColumn(name = "user_id")
    private User user;
    @Column(nullable = false) private boolean pushNotificationEnabled;
    @Column(nullable = false) private boolean locationSharingEnabled;
    public UserSetting(User user) { this.user = user; }
    public void update(Boolean push, Boolean location) {
        if (push != null) pushNotificationEnabled = push;
        if (location != null) locationSharingEnabled = location;
    }
}
